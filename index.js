const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const TRACKED_ROLE_IDS = [
    "1470843290307006588",
];

if (!DISCORD_TOKEN || !GUILD_ID) {
    throw new Error("Missing DISCORD_TOKEN or GUILD_ID in environment variables.");
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

const CACHE_PATH = path.join(__dirname, "cache", "roles.json");
let roleCache = {};
let botReady = false;

function loadCache() {
    try {
        if (!fs.existsSync(CACHE_PATH)) {
            fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
            fs.writeFileSync(CACHE_PATH, "{}", "utf8");
            roleCache = {};
            console.log("Created new cache file.");
            return;
        }

        const raw = fs.readFileSync(CACHE_PATH, "utf8").trim();

        if (!raw) {
            roleCache = {};
            fs.writeFileSync(CACHE_PATH, "{}", "utf8");
            console.log("Cache file was empty. Reset to {}.");
            return;
        }

        roleCache = JSON.parse(raw);
        console.log("Cache loaded successfully.");
    } catch (err) {
        console.error("Failed to read cache file:", err);
        roleCache = {};
    }
}

function saveCache() {
    try {
        fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(roleCache, null, 2), "utf8");
    } catch (err) {
        console.error("Failed to save cache file:", err);
    }
}

async function refreshRole(roleId) {
    console.log(`Refreshing role ${roleId}...`);

    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Fetched guild ${guild.id}`);

    const members = await guild.members.fetch();
    console.log(`Fetched ${members.size} total guild members`);

    const filtered = members
        .filter((member) => !member.user.bot && member.roles.cache.has(roleId))
        .map((member) => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL({ size: 128, extension: "png" }),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    roleCache[roleId] = {
        updatedAt: new Date().toISOString(),
        count: filtered.length,
        members: filtered,
    };

    saveCache();

    console.log(`Found ${filtered.length} members with role ${roleId}`);
    return roleCache[roleId];
}

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        botReady,
        cachedRoles: Object.keys(roleCache),
        port: PORT,
    });
});

app.get("/api/role-members/:roleId", async (req, res) => {
    const { roleId } = req.params;
    console.log(`Incoming request for role ${roleId}`);

    try {
        if (!botReady) {
            return res.status(503).json({
                error: "Bot is not ready yet. Try again in a few seconds.",
            });
        }

        if (roleCache[roleId]) {
            console.log(`Returning cached data for role ${roleId}`);
            return res.json(roleCache[roleId]);
        }

        console.log(`No cache found for role ${roleId}, fetching from Discord...`);
        const data = await refreshRole(roleId);
        return res.json(data);
    } catch (err) {
        console.error("Failed to fetch role members:", err);
        return res.status(500).json({
            error: "Failed to fetch role members",
            details: err.message,
        });
    }
});

app.post("/api/role-members/:roleId/refresh", async (req, res) => {
    const { roleId } = req.params;

    try {
        if (!botReady) {
            return res.status(503).json({
                error: "Bot is not ready yet. Try again in a few seconds.",
            });
        }

        const data = await refreshRole(roleId);
        return res.json(data);
    } catch (err) {
        console.error("Refresh failed:", err);
        return res.status(500).json({
            error: "Refresh failed",
            details: err.message,
        });
    }
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    botReady = true;

    for (const roleId of TRACKED_ROLE_IDS) {
        try {
            await refreshRole(roleId);
            console.log(`Preloaded role ${roleId}`);
        } catch (err) {
            console.error(`Failed to preload role ${roleId}:`, err);
        }
    }

    setInterval(async () => {
        for (const roleId of TRACKED_ROLE_IDS) {
            try {
                await refreshRole(roleId);
                console.log(`Scheduled refresh completed for role ${roleId}`);
            } catch (err) {
                console.error(`Scheduled refresh failed for role ${roleId}:`, err);
            }
        }
    }, 5 * 60 * 1000);
});

client.on("error", (err) => {
    console.error("Discord client error:", err);
});

client.on("warn", (msg) => {
    console.warn("Discord client warning:", msg);
});

client.on("shardError", (err) => {
    console.error("Discord shard error:", err);
});

client.on("shardDisconnect", (event, shardId) => {
    console.error(`Shard ${shardId} disconnected`, event);
});

client.on("shardReconnecting", (shardId) => {
    console.warn(`Shard ${shardId} reconnecting`);
});

client.on("shardReady", (shardId) => {
    console.log(`Shard ${shardId} ready`);
});

loadCache();

const server = app.listen(PORT, HOST, () => {
    console.log(`API running on http://${HOST}:${PORT}`);
    console.log("Starting Discord login...");

    const loginTimeout = setTimeout(() => {
        if (!botReady) {
            console.error("Discord ready event did not fire within 30 seconds.");
        }
    }, 30000);

    client.login(DISCORD_TOKEN)
        .then(() => {
            console.log("Discord login promise resolved.");
        })
        .catch((err) => {
            console.error("Discord login failed:", err);
        })
        .finally(() => {
            clearTimeout(loginTimeout);
        });
});

server.on("error", (err) => {
    console.error("Express server failed to start:", err);
});
