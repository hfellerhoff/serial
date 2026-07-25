# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.7.0
ARG PNPM_VERSION=10.34.5

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION}-alpine AS base

# Set working directory for all build stages.
WORKDIR /usr/src/app

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

################################################################################
# Create a stage for building the application.
# This runs on the native build platform ($BUILDPLATFORM) so that the expensive
# Vite/Rolldown bundling step avoids QEMU emulation overhead. The output is
# platform-agnostic JavaScript, so it can be copied into any target platform.
################################################################################
FROM --platform=$BUILDPLATFORM base AS build-base

# Download all dependencies (including devDependencies) needed for building.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=bind,source=pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the source files into the image.
COPY . .

ENV NODE_OPTIONS="--max-old-space-size=4096"

# Demo mode is an image-level capability because it includes a destructive
# scheduled task. Only the demo Compose file selects this build stage.
FROM build-base AS build-demo
RUN pnpm exec vite build --mode demo && \
    cp instrument.server.mjs .output/server && \
    pnpm run build:sw

# Run the standard build (without migrations - those run at container startup).
FROM build-base AS build
RUN pnpm run build:atomic

################################################################################
# Create a new stage to run the application with minimal runtime dependencies
# where the necessary files are copied from the build stage.
################################################################################
FROM base AS final-base

# Copy package.json, pnpm-lock.yaml, and pnpm-workspace.yaml so that package
# manager commands can be used. pnpm-workspace.yaml holds the overrides config,
# which must be present or --frozen-lockfile fails with a config mismatch.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies for the target platform.
# --ignore-scripts skips native compilation which is
# slow under QEMU and not needed at runtime.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy migration files and source needed for running migrations
COPY --from=build-base /usr/src/app/src/server/db ./src/server/db
COPY --from=build-base /usr/src/app/src/env.js ./src/env.js

# Expose the port that the application listens on.
EXPOSE 3000

# Run migrations then start the application.
CMD ["sh", "-c", "node --experimental-specifier-resolution=node --loader ts-node/esm src/server/db/migrate.js 2>/dev/null || node --import=tsx src/server/db/migrate.ts && node .output/server/index.mjs"]

FROM final-base AS final-demo
COPY --from=build-demo /usr/src/app/.output ./.output

# Keep the standard image as the default Dockerfile target.
FROM final-base AS final
COPY --from=build /usr/src/app/.output ./.output
