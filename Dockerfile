FROM node:22-slim AS build
WORKDIR /src

COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --no-audit --no-fund
COPY web ./web
RUN npm --prefix web run build

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    FLY_WEB_DIST=/app/web/dist \
    FLY_ACCOUNTS_FILE=/var/lib/feixingqi/accounts.json
WORKDIR /app

COPY --from=build /src/server ./server
COPY --from=build /src/web/dist ./web/dist

RUN mkdir -p /var/lib/feixingqi
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
