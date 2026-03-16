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