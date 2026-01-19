# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.7.0
ARG PNPM_VERSION=10.8.0

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION}-alpine AS base

# Set working directory for all build stages.
WORKDIR /usr/src/app

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

################################################################################
# Create a stage for installing production dependecies.
FROM base AS deps

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# Leverage bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

################################################################################
# Create a stage for building the application.
FROM deps AS build

# Download additional development dependencies before building, as some projects require
# "devDependencies" to be installed to build. If you don't need this, remove this step.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the source files into the image.
COPY . .

# Run the build script (without migrations - those run at container startup)
RUN pnpm run build:atomic

################################################################################
# Create a new stage to run the application with minimal runtime dependencies
# where the necessary files are copied from the build stage.
FROM base AS final

# Copy package.json and pnpm-lock.yaml so that package manager commands can be used.
COPY package.json pnpm-lock.yaml ./

# Copy node_modules from build stage (includes all deps needed for migrations)
COPY --from=build /usr/src/app/node_modules ./node_modules

# Copy the built application from the build stage into the image.
COPY --from=build /usr/src/app/.output ./.output
COPY --from=build /usr/src/app/.content-collections ./.content-collections

# Copy migration files and source needed for running migrations
COPY --from=build /usr/src/app/src/server/db ./src/server/db
COPY --from=build /usr/src/app/src/env.js ./src/env.js

# Expose the port that the application listens on.
EXPOSE 3000

# Run migrations then start the application.
CMD ["sh", "-c", "node --experimental-specifier-resolution=node --loader ts-node/esm src/server/db/migrate.js 2>/dev/null || node --import=tsx src/server/db/migrate.ts && node .output/server/index.mjs"]
