module.exports = {
  apps: [
    {
      name: "portfolio-garden",
      script: "server/production.mjs",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "8787",
        GATE_SECURE: "1",
      },
    },
  ],
};
