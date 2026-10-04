FROM node:18-bookworm-slim
WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app/data || true
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
