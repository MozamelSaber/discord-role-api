const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// Put the role IDs you want cached here
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

// Load cache on startup
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

// Health route
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        botReady: client.isReady(),
        cachedRoles: Object.keys(roleCache),
    });
});

// Get role members
app.get("/api/role-members/:roleId", async (req, res) => {
    const { roleId } = req.params;
    console.log(`Incoming request for role ${roleId}`);

    try {
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

// Manual refresh
app.post("/api/role-members/:roleId/refresh", async (req, res) => {
    const { roleId } = req.params;
    console.log(`Manual refresh requested for role ${roleId}`);

    try {
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

    for (const roleId of TRACKED_ROLE_IDS) {
        try {
            await refreshRole(roleId);
            console.log(`Preloaded role ${roleId}`);
        } catch (err) {
            console.error(`Failed to preload role ${roleId}:`, err);
        }
    }

    setInterval(async () => {
        console.log("Running scheduled role refresh...");

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

async function start() {
    loadCache();

    app.listen(PORT, () => {
        console.log(`API running on port ${PORT}`);
    });

    await client.login(DISCORD_TOKEN);
}

start().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});