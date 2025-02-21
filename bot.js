require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const mongoose = require("mongoose");
const moment = require("moment");

// Connect to MongoDB
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Define Expense Schema
const expenseSchema = new mongoose.Schema({
    userId: String,
    date: String,
    amount: Number,
    category: String,
});

// Expense Model
const Expense = mongoose.model("Expense", expenseSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Function to get total expenses for today
async function getTotalToday(userId) {
    const date = moment().format("YYYY-MM-DD");
    const expenses = await Expense.find({ userId, date });
    return expenses.reduce((sum, entry) => sum + entry.amount, 0);
}

// Function to send the main menu
async function sendMainMenu(ctx) {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username
        ? `@${ctx.from.username}`
        : ctx.from.first_name;
    const totalToday = (await getTotalToday(userId)).toLocaleString();
    const todayDate = moment().format("MMMM D, YYYY");

    ctx.reply(
        `👋 Welcome, ${username}\n\n` +
            `📅 ${todayDate} \n\n` +
            `💰 Today's Total Expense: ${totalToday} KHR\n\n` +
            "Track your expenses easily. Choose an option below:",
        Markup.inlineKeyboard([
            [Markup.button.callback("➕ Add Expense", "add_expense")],
            [
                Markup.button.callback(
                    "📜 View Transactions",
                    "view_transactions"
                ),
                Markup.button.callback("🗑 Clear Data", "clear_data"),
            ],
        ]),
        { parse_mode: "MarkdownV2" }
    );
}

// Handle /start command
bot.start((ctx) => {
    sendMainMenu(ctx);
});

// Handle "Add Expense" button click
bot.action("add_expense", (ctx) => {
    ctx.reply(
        "🚀 Enter your expense in this format:\n\n⚡️ Example: `/add 15 Dinner`",
        { parse_mode: "MarkdownV2" }
    );
});

// Handle "View Transactions" button click
bot.action("view_transactions", async (ctx) => {
    const userId = ctx.from.id.toString();
    const date = moment().format("YYYY-MM-DD");
    const expenses = await Expense.find({ userId, date });

    if (expenses.length === 0) {
        return ctx.reply("📜 No transactions recorded today.");
    }

    let message = escapeMarkdownV2(`📅 *Transactions for Today:*\n\n`);
    expenses.forEach((entry, index) => {
        const category = escapeMarkdownV2(
            entry.category.charAt(0).toUpperCase() + entry.category.slice(1)
        );
        const amount = escapeMarkdownV2(entry.amount.toString());

        message += `${index + 1}\\. *${category}*  KHR${amount}\n`;
    });

    ctx.reply(message, { parse_mode: "MarkdownV2" });
});

// Handle "Clear Data" button click (Ask for Confirmation)
bot.action("clear_data", (ctx) => {
    ctx.reply(
        "⚠️ Are you sure you want to clear today's expenses? This action cannot be undone.",
        Markup.inlineKeyboard([
            [Markup.button.callback("✅ Yes, Clear", "confirm_clear")],
            [Markup.button.callback("❌ Cancel", "cancel_clear")],
        ])
    );
});

// Handle Confirmation for Clearing Data
bot.action("confirm_clear", async (ctx) => {
    const userId = ctx.from.id.toString();
    const date = moment().format("YYYY-MM-DD");

    await Expense.deleteMany({ userId, date });

    ctx.reply("✅ All today's expenses have been cleared.");
    sendMainMenu(ctx);
});

// Handle Cancel Clear Action
bot.action("cancel_clear", (ctx) => {
    ctx.reply("❌ Action cancelled. Your data is safe.");
});

// Handle /add command
bot.command("add", async (ctx) => {
    const userId = ctx.from.id.toString();
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) {
        return ctx.reply(
            "❌ Usage: `/add <amount> <category>`\nExample: `/add 10 Lunch`",
            { parse_mode: "MarkdownV2" }
        );
    }

    const amount = parseFloat(parts[1]);
    const category = parts.slice(2).join(" ");
    const date = moment().format("YYYY-MM-DD");

    if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Please enter a valid amount.");
    }

    await Expense.create({ userId, date, amount, category });

    // Escape MarkdownV2 special characters
    const escapedCategory = escapeMarkdownV2(category);
    const escapedDate = escapeMarkdownV2(date);
    const escapedAmount = escapeMarkdownV2(amount.toString());

    ctx.reply(
        `⛄️ *${escapedAmount}KHR* added for *${escapedCategory}* on ${escapedDate}`,
        { parse_mode: "MarkdownV2" }
    ).then(() => {
        sendMainMenu(ctx);
    });
});

function escapeMarkdownV2(text) {
    return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
}

// Start bot
bot.launch();
console.log("🚀 Money Tracker Bot is running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
