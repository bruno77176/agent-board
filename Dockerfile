FROM node:22-alpine
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY mcp/package.json ./mcp/
RUN npm ci

# Copy full source and build everything
COPY . .
RUN npm run build:local

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=server"]
