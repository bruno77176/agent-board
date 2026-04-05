FROM node:22-alpine
WORKDIR /app

# Install ALL dependencies (devDeps needed for Vite/TS build)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY mcp/package.json ./mcp/
RUN npm ci

# Copy full source and build everything
COPY . .
RUN npm run build:local

# Set production mode after build (server uses this to serve static files)
ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "run", "--workspace=server", "start"]
