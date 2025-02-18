require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const moment = require("moment");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const DATA_FILE = "expenses.json";

// Load expenses from file
function loadExpenses() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// Save expenses to file
function saveExpenses(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize expenses data
let expenses = loadExpenses();

// Function to get total expenses for today
function getTotalToday() {
    const date = moment().format("YYYY-MM-DD");
    if (!expenses[date]) return 0;
    return expenses[date].reduce((sum, entry) => sum + entry.amount, 0);
}

// Function to send the main menu
function sendMainMenu(ctx) {
    const username = ctx.from.username
        ? `@${ctx.from.username}`
        : ctx.from.first_name;
    const totalToday = getTotalToday();

    ctx.reply(
        `👋 Welcome, *${username}*! I am *Money Tracker Bot*! 💰\n\n` +
            `📅 *Today's Total Expense:* KHR ${totalToday.toFixed(2)}\n\n` +
            "Track your expenses easily. Choose an option below:",
        Markup.inlineKeyboard([
            [Markup.button.callback("➕ Add Expense", "add_expense")],
            [
                Markup.button.callback(
                    "📜 View Transactions",
                    "view_transactions"
                ),
            ],
        ]),
        { parse_mode: "Markdown" }
    );
}

// Handle /start command
bot.start((ctx) => {
    sendMainMenu(ctx);
});

// Handle "Add Expense" button click
bot.action("add_expense", (ctx) => {
    ctx.reply(
        "Enter your expense in this format:\n`/add <amount> <category>`\n\nExample: `/add 15 Dinner`",
        { parse_mode: "Markdown" }
    );
});

// Handle "View Transactions" button click
bot.action("view_transactions", (ctx) => {
    const date = moment().format("YYYY-MM-DD");
    if (!expenses[date] || expenses[date].length === 0) {
        return ctx.reply("📜 No transactions recorded today.");
    }

    let message = `📅 *Transactions for Today:*\n\n`;
    expenses[date].forEach((entry, index) => {
        message += `${index + 1}. *${entry.category}* - $${entry.amount}\n`;
    });

    ctx.reply(message, { parse_mode: "Markdown" });
});

// Handle /add command
bot.command("add", (ctx) => {
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) {
        return ctx.reply(
            "❌ Usage: `/add <amount> <category>`\nExample: `/add 10 Lunch`",
            { parse_mode: "Markdown" }
        );
    }

    const amount = parseFloat(parts[1]);
    const category = parts.slice(2).join(" ");
    const date = moment().format("YYYY-MM-DD");

    if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ Please enter a valid amount.");
    }

    if (!expenses[date]) expenses[date] = [];
    expenses[date].push({ amount, category });

    saveExpenses(expenses);

    const totalToday = getTotalToday();

    ctx.reply(`✅ *KHR${amount}* added for *${category}* on ${date}`, {
        parse_mode: "Markdown",
    }).then(() => {
        sendMainMenu(ctx); // Show updated menu after adding expense
    });
});

// Start bot
bot.launch();
console.log("🚀 Money Tracker Bot is running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
