FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
# Optional trust bundle for builds behind an authenticated corporate/cloud proxy.
# It is mounted only during the build and is never copied into the image.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
