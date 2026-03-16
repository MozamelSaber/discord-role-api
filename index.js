const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

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

// in-memory cache
let roleCache = {};

// load existing cache on startup
if (fs.existsSync(CACHE_PATH)) {
    try {
        roleCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    } catch (err) {
        console.error("Failed to read cache file:", err);
    }
}

function saveCache() {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(roleCache, null, 2), "utf8");
}

async function refreshRole(roleId) {
    const guild = await client.guilds.fetch(GUILD_ID);

    // Fetch all members into cache
    const members = await guild.members.fetch();

    const filtered = members
        .filter((member) => !member.user.bot && member.roles.cache.has(roleId))
        .map((member) => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL({ size: 128, extension: "png" }),
        }));

    roleCache[roleId] = {
        updatedAt: new Date().toISOString(),
        count: filtered.length,
        members: filtered,
    };

    saveCache();
    return roleCache[roleId];
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
});

app.get("/api/role-members/:roleId", async (req, res) => {
    const { roleId } = req.params;

    try {
        // Return cached version immediately if available
        if (roleCache[roleId]) {
            return res.json(roleCache[roleId]);
        }

        // Otherwise build cache on first request
        const data = await refreshRole(roleId);
        res.json(data);
    } catch (err) {
        console.error("Failed to fetch role members:", err);
        res.status(500).json({
            error: "Failed to fetch role members",
            details: err.message,
        });
    }
});

// Optional manual refresh route
app.post("/api/role-members/:roleId/refresh", async (req, res) => {
    const { roleId } = req.params;

    try {
        const data = await refreshRole(roleId);
        res.json(data);
    } catch (err) {
        console.error("Refresh failed:", err);
        res.status(500).json({
            error: "Refresh failed",
            details: err.message,
        });
    }
});

app.listen(PORT, async () => {
    console.log(`API running on port ${PORT}`);
    await client.login(DISCORD_TOKEN);

    // Optional: preload a known role here if you want
    // await refreshRole("YOUR_ROLE_ID");
});