const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

let botReady = false;
let loginResolved = false;
let loginRejected = false;
let lastError = null;
let restAuthResult = null;

if (!DISCORD_TOKEN || !GUILD_ID) {
    throw new Error("Missing DISCORD_TOKEN or GUILD_ID in environment variables.");
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        botReady,
        loginResolved,
        loginRejected,
        restAuthResult,
        tokenLength: DISCORD_TOKEN.length,
        guildIdSet: Boolean(GUILD_ID),
        lastError,
    });
});

app.get("/diag", async (req, res) => {
    res.json({
        status: "ok",
        botReady,
        loginResolved,
        loginRejected,
        restAuthResult,
        tokenLength: DISCORD_TOKEN.length,
        guildIdSet: Boolean(GUILD_ID),
        lastError,
    });
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    botReady = true;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        console.log(`Fetched guild ${guild.id}`);
    } catch (err) {
        console.error("Guild fetch failed after ready:", err);
        lastError = `Guild fetch failed: ${err.message}`;
    }
});

client.on("error", (err) => {
    console.error("Discord client error:", err);
    lastError = `client error: ${err.message}`;
});

client.on("warn", (msg) => {
    console.warn("Discord client warning:", msg);
});

client.on("shardError", (err) => {
    console.error("Discord shard error:", err);
    lastError = `shard error: ${err.message}`;
});

client.on("shardDisconnect", (event, shardId) => {
    console.error(`Shard ${shardId} disconnected`, event);
    lastError = `shard ${shardId} disconnected`;
});

client.on("shardReconnecting", (shardId) => {
    console.warn(`Shard ${shardId} reconnecting`);
});

client.on("shardReady", (shardId) => {
    console.log(`Shard ${shardId} ready`);
});

async function testDiscordRestAuth() {
    try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
            headers: {
                Authorization: `Bot ${DISCORD_TOKEN}`,
            },
        });

        const text = await response.text();

        restAuthResult = {
            ok: response.ok,
            status: response.status,
            body: text.slice(0, 300),
        };

        console.log("REST auth result:", restAuthResult);
    } catch (err) {
        restAuthResult = {
            ok: false,
            status: null,
            body: err.message,
        };
        console.error("REST auth test failed:", err);
        lastError = `REST auth failed: ${err.message}`;
    }
}

const server = app.listen(PORT, HOST, async () => {
    console.log(`API running on http://${HOST}:${PORT}`);
    console.log(`Token length: ${DISCORD_TOKEN.length}`);
    console.log(`Guild ID: ${GUILD_ID}`);

    await testDiscordRestAuth();

    console.log("Starting Discord login...");

    const loginTimeout = setTimeout(() => {
        if (!botReady) {
            console.error("Discord ready event did not fire within 30 seconds.");
            lastError = "Discord ready event did not fire within 30 seconds.";
        }
    }, 30000);

    client.login(DISCORD_TOKEN)
        .then(() => {
            loginResolved = true;
            console.log("Discord login promise resolved.");
        })
        .catch((err) => {
            loginRejected = true;
            lastError = `Discord login failed: ${err.message}`;
            console.error("Discord login failed:", err);
        })
        .finally(() => {
            clearTimeout(loginTimeout);
        });
});

server.on("error", (err) => {
    console.error("Express server failed to start:", err);
});