# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.7.0
ARG PNPM_VERSION=10.34.5
ARG TURBO_VERSION=2.10.5

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION}-alpine AS base

ARG PNPM_VERSION
ARG TURBO_VERSION

# Set working directory for all build stages.
WORKDIR /usr/src/app

# Install the workspace package manager and task runner.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION} turbo@${TURBO_VERSION} && \
    pnpm --version && \
    turbo --version

################################################################################
# Prune the workspace to the app and its dependencies. This runs on the native
# build platform so workspace graph preparation avoids QEMU emulation.
################################################################################
FROM --platform=$BUILDPLATFORM base AS prepare

COPY . .
RUN turbo prune @serial/app --docker

################################################################################
# Install the pruned workspace and build the application. This also runs on the
# native build platform because the output is platform-agnostic JavaScript.
################################################################################
FROM --platform=$BUILDPLATFORM base AS build-base

# Download all dependencies (including devDependencies) needed for building.
COPY --from=prepare /usr/src/app/out/json/ ./
COPY --from=prepare /usr/src/app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the pruned source after installing dependencies so source-only changes do
# not invalidate the dependency layer.
COPY --from=prepare /usr/src/app/out/full/ ./

ENV NODE_OPTIONS="--max-old-space-size=4096"

# Demo mode is an image-level capability because it includes a destructive
# scheduled task. Only the demo Compose file selects this build stage.
FROM build-base AS build-demo
RUN pnpm --filter @serial/app exec vite build --mode demo && \
    cp apps/app/instrument.server.mjs apps/app/.output/server && \
    pnpm --filter @serial/app run build:sw

# Run the standard build (without migrations - those run at container startup).
FROM build-base AS build
RUN pnpm --filter @serial/app run build:artifact

################################################################################
# Create a new stage to run the application with minimal runtime dependencies
# where the necessary files are copied from the build stage.
################################################################################
FROM base AS final-base

# Copy only the app's pruned workspace manifests and lockfile.
COPY --from=prepare /usr/src/app/out/json/ ./
COPY --from=prepare /usr/src/app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies for the target platform.
# --ignore-scripts skips native compilation which is
# slow under QEMU and not needed at runtime.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

WORKDIR /usr/src/app/apps/app

# Copy migration files and source needed for running migrations
COPY --from=build-base /usr/src/app/apps/app/src/server/db ./src/server/db
COPY --from=build-base /usr/src/app/apps/app/src/env.js ./src/env.js
COPY --from=build-base /usr/src/app/apps/app/src/lib/extension-auth.ts ./src/lib/extension-auth.ts
COPY --from=build-base /usr/src/app/packages/extension-identity /usr/src/app/packages/extension-identity

# Catch missing transitive imports in the migration runtime before deployment.
RUN PUBLIC_BASE_URL=http://localhost \
    BETTER_AUTH_SECRET=container-build-smoke-test \
    NODE_ENV=production \
    node --import=tsx -e "await import('./src/env.js')"

# Expose the port that the application listens on.
EXPOSE 3000

# Run migrations then start the application.
CMD ["sh", "-c", "node --experimental-specifier-resolution=node --loader ts-node/esm src/server/db/migrate.js 2>/dev/null || node --import=tsx src/server/db/migrate.ts && node .output/server/index.mjs"]

FROM final-base AS final-demo
COPY --from=build-demo /usr/src/app/apps/app/.output ./.output

# Keep the standard image as the default Dockerfile target.
FROM final-base AS final
COPY --from=build /usr/src/app/apps/app/.output ./.output
