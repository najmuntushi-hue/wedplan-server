import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import type Stripe from "stripe";
import { getDB } from "../config/db.js";
import { stripe } from "../config/stripe.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

// POST /payments/create-checkout-session (vendor only, vendorId comes from JWT, never from body)
router.post("/create-checkout-session", verifyJWT, requireRole("vendor"), async (req, res, next) => {
  try {
    const vendor = req.user!;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      customer_email: vendor.email,
      metadata: { vendorId: String(vendor._id) },
      subscription_data: { metadata: { vendorId: String(vendor._id) } },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    await getDB().collection("transactions").insertOne({
      vendorId: vendor._id,
      plan: "premium",
      amount: session.amount_total ?? 1000,
      currency: session.currency ?? "usd",
      stripeSessionId: session.id,
      stripeSubscriptionId: null,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

// Webhook handler (mounted in index.ts with express.raw BEFORE express.json)
export async function stripeWebhook(req: Request, res: Response) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"] as string,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return res.status(400).send("Invalid signature");
  }

  const db = getDB();
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const vendorId = s.metadata?.vendorId;
      if (s.payment_status === "paid" && vendorId && ObjectId.isValid(vendorId)) {
        await db.collection("transactions").updateOne(
          { stripeSessionId: s.id },
          {
            $set: {
              status: "paid",
              amount: s.amount_total ?? 0,
              currency: s.currency ?? "usd",
              stripeSubscriptionId: (s.subscription as string) || null,
            },
          }
        );
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        await db.collection("user").updateOne(
          { _id: new ObjectId(vendorId) },
          { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: expires } }
        );
      }
    }

    if (event.type === "invoice.paid") {
      const inv = event.data.object as any;
      const subId = inv.subscription || inv.parent?.subscription_details?.subscription;
      if (subId) {
        const tx = await db.collection("transactions").findOne({ stripeSubscriptionId: subId });
        if (tx) {
          const expires = new Date();
          expires.setDate(expires.getDate() + 30);
          await db.collection("user").updateOne(
            { _id: tx.vendorId },
            { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: expires } }
          );
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const vendorId = sub.metadata?.vendorId;
      if (vendorId && ObjectId.isValid(vendorId)) {
        await db.collection("user").updateOne(
          { _id: new ObjectId(vendorId) },
          { $set: { subscriptionPlan: "free", subscriptionExpiresAt: null } }
        );
      }
    }

    if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      await db.collection("transactions").updateOne(
        { stripeSessionId: s.id, status: "pending" },
        { $set: { status: "failed" } }
      );
    }
  } catch (e) {
    console.error("Webhook processing error:", e);
    return res.status(500).send("Webhook handler failed");
  }

  res.json({ received: true });
}

export default router;