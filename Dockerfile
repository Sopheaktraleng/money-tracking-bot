FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* && update-ca-certificates
ENV NODE_ENV=production NODE_OPTIONS=--dns-result-order=ipv4first
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node","bot.js"]
