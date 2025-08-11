require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const mongoose = require("mongoose");
const moment = require("moment");
const dns = require("dns");

// Prefer IPv4
dns.setDefaultResultOrder?.("ipv4first");
const QUICK_CATS = [
    "Food",
    "Coffee",
    "Transport",
    "Taxi",
    "Rent",
    "Entertainment",
];

function catEmoji(name) {
    return name === "Food"
        ? "🍔"
        : name === "Coffee"
        ? "☕"
        : name === "Transport"
        ? "🚌"
        : name === "Taxi"
        ? "🚕"
        : name === "Rent"
        ? "🏠"
        : "🎮";
}

function categoryKeyboard() {
    const rows = [];
    for (let i = 0; i < QUICK_CATS.length; i += 2) {
        rows.push(
            [
                Markup.button.callback(
                    `${catEmoji(QUICK_CATS[i])} ${QUICK_CATS[i]}`,
                    `cat:${QUICK_CATS[i]}`
                ),
                QUICK_CATS[i + 1]
                    ? Markup.button.callback(
                          `${catEmoji(QUICK_CATS[i + 1])} ${QUICK_CATS[i + 1]}`,
                          `cat:${QUICK_CATS[i + 1]}`
                      )
                    : undefined,
            ].filter(Boolean)
        );
    }
    return Markup.inlineKeyboard(rows);
}
// userId -> { step: 'category'|'amount', category?: string }
const userState = new Map();

// ---- Env sanity ------------------------------------------------------------
const RAW_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!RAW_TOKEN) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN");
    process.exit(1);
}
const TOKEN = RAW_TOKEN.trim();
if (TOKEN.startsWith("bot")) {
    console.warn(
        '⚠️ Token should NOT start with "bot". Use the raw token from @BotFather.'
    );
}
console.log("🔑 Token length:", TOKEN.length);

// ---- Mongo connect (await before launching bot) ----------------------------
(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
        });
        console.log("✅ Connected to MongoDB");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err?.message || err);
        process.exit(1);
    }

    // ---- Schema & Model ------------------------------------------------------
    const expenseSchema = new mongoose.Schema({
        userId: String,
        date: String,
        amount: Number,
        category: String,
    });
    const Expense = mongoose.model("Expense", expenseSchema);

    // ---- Bot init ------------------------------------------------------------
    const bot = new Telegraf(TOKEN);

    bot.catch((err, ctx) => {
        console.error(
            "🤖 Telegraf error for update",
            ctx.update?.update_id,
            err
        );
    });

    try {
        const me = await bot.telegram.getMe();
        console.log(
            "✅ Telegram API OK. Bot:",
            `@${me.username}`,
            `(${me.id})`
        );
    } catch (err) {
        console.error("❌ Telegram API check failed:", err?.message || err);
        process.exit(1);
    }

    // ---- Helpers -------------------------------------------------------------
    function escapeMarkdownV2(text) {
        // Put '-' at start or end to avoid range like '+-='
        return text.replace(/[-_*[\]()~`>#+=|{}.!]/g, "\\$&");
    }

    async function getTotalToday(userId) {
        const todayString = moment().format("YYYY-MM-DD");
        const todayStart = moment().startOf("day").toDate();
        const todayEnd = moment().endOf("day").toDate();

        let expenses = await Expense.find({ userId, date: todayString });
        if (expenses.length === 0) {
            expenses = await Expense.find({
                userId,
                date: { $gte: todayStart, $lte: todayEnd },
            });
        }
        return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    }

    async function getTotalExpenses(userId) {
        const rows = await Expense.find({ userId });
        return rows.reduce((sum, e) => sum + (e.amount || 0), 0);
    }

    async function sendMainMenu(ctx) {
        const userId = String(ctx.from.id);
        const username = ctx.from.username
            ? `@${ctx.from.username}`
            : ctx.from.first_name;
        const totalToday = (await getTotalToday(userId)).toLocaleString();
        const todayDate = moment().format("MMMM D, YYYY");
        const totalExpense = (await getTotalExpenses(userId)).toLocaleString();

        const text =
            `👋 Welcome, ${escapeMarkdownV2(username)}\n\n` +
            `📊 Total Expenses: ${escapeMarkdownV2(totalExpense)} KHR\n\n` +
            `📅 ${escapeMarkdownV2(todayDate)} \n\n` +
            `💰 Today's Total Expense: ${escapeMarkdownV2(
                totalToday
            )} KHR\n\n` +
            // Escape the dot in the final sentence (or escape whole sentence)
            escapeMarkdownV2(
                "Track your expenses easily. Choose an option below:"
            );

        await ctx.reply(text, {
            parse_mode: "MarkdownV2",
            ...Markup.inlineKeyboard([
                [Markup.button.callback("➕ Add Expense", "add_expense")],
                [
                    Markup.button.callback(
                        "📜 View Transactions",
                        "view_transactions"
                    ),
                    Markup.button.callback("🗑 Clear Data", "clear_data"),
                ],
            ]),
        });
    }

    // ---- Commands & Actions --------------------------------------------------
    bot.start(async (ctx) => {
        await sendMainMenu(ctx);
    });

    bot.action("add_expense", async (ctx) => {
        await ctx.reply(
            "🚀 Enter your expense in this format:\n\nExample: `/add 15 Dinner`",
            { parse_mode: "MarkdownV2" }
        );
    });

    bot.action("view_transactions", async (ctx) => {
        const userId = String(ctx.from.id);
        const date = moment().format("YYYY-MM-DD");
        const expenses = await Expense.find({ userId, date });

        if (expenses.length === 0) {
            return ctx.reply("📜 No transactions recorded today.");
        }

        let message = "📅 Transactions for Today:\n\n";
        expenses.forEach((entry, idx) => {
            const category = (entry.category || "").trim();
            const amount = Number(entry.amount || 0).toLocaleString();

            // Escape variables; keep Markdown syntax; escape the index dot
            message += `${idx + 1}\\. *${escapeMarkdownV2(
                category.charAt(0).toUpperCase() + category.slice(1)
            )}*  *${escapeMarkdownV2(amount)}៛*\n`;
        });

        await ctx.reply(message, { parse_mode: "MarkdownV2" });
    });

    bot.action("clear_data", async (ctx) => {
        await ctx.reply(
            "⚠️ Are you sure you want to clear today's expenses? This action cannot be undone.",
            Markup.inlineKeyboard([
                [Markup.button.callback("✅ Yes, Clear", "confirm_clear")],
                [Markup.button.callback("❌ Cancel", "cancel_clear")],
            ])
        );
    });

    bot.action("confirm_clear", async (ctx) => {
        const userId = String(ctx.from.id);
        const date = moment().format("YYYY-MM-DD");
        await Expense.deleteMany({ userId, date });
        await ctx.reply("✅ All today's expenses have been cleared.");
        await sendMainMenu(ctx);
    });

    bot.action("cancel_clear", async (ctx) => {
        await ctx.reply("❌ Action cancelled. Your data is safe.");
    });

    bot.command("add", async (ctx) => {
        const userId = String(ctx.from.id);
        const parts = (ctx.message?.text || "").trim().split(/\s+/);
        if (parts.length < 3) {
            return ctx.reply(
                "❌ Usage: `/add <amount> <category>`\nExample: `/add 10 Lunch`",
                { parse_mode: "MarkdownV2" }
            );
        }

        const amount = parseFloat(parts[1]);
        const category = parts.slice(2).join(" ");
        const date = moment().format("YYYY-MM-DD");

        if (!Number.isFinite(amount) || amount <= 0) {
            return ctx.reply("❌ Please enter a valid amount.");
        }

        await Expense.create({ userId, date, amount, category });

        const capitalizedCategory =
            category.charAt(0).toUpperCase() + category.slice(1);
        const msg =
            `⛄️ *${escapeMarkdownV2(amount.toString())}៛* added for ` +
            `*${escapeMarkdownV2(capitalizedCategory)}* on ${escapeMarkdownV2(
                date
            )}`;

        await ctx.reply(msg, { parse_mode: "MarkdownV2" });
        await sendMainMenu(ctx);
    });

    // ---- Graceful stop -------------------------------------------------------
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

    // ---- Launch --------------------------------------------------------------
    try {
        await bot.launch({
            dropPendingUpdates: true,
            allowed_updates: ["message", "callback_query"],
        });
        console.log("🚀 Money Tracker Bot is running...");
    } catch (err) {
        console.error("❌ Failed to launch bot:", err?.message || err);
        process.exit(1);
    }
})();
