FROM node:22-alpine

WORKDIR /app

# Copy app sources. `bin/` is intentionally omitted — it does not exist yet.
COPY --chown=node:node package.json LICENSE README.md ./
COPY --chown=node:node src ./src
COPY --chown=node:node lenses ./lenses

USER node

ENV HOST=0.0.0.0 \
    PORT=3040 \
    NODE_ENV=production

EXPOSE 3040

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:3040/ || exit 1

CMD ["node", "src/server.js"]
