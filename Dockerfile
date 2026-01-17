FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm
WORKDIR /
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the nitro app
FROM base AS builder
RUN npm install -g pnpm
WORKDIR /
COPY --from=deps /node_modules ./node_modules
COPY . .
RUN pnpm build

# Create an optimised runner image
FROM base AS runner
WORKDIR /
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nitro
COPY --from=builder /.output ./.output
USER nitro
EXPOSE 3000
ENV PORT 3000
CMD ["node", ".output/server/index.mjs"]
