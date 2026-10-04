# syntax=docker/dockerfile:1.7
# Build context MUST be sandbox/; only dependency manifests and verification files enter the image.
FROM kraxxdeceit-node24-base:24.19.0
USER root
ENV HOME=/root
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/kraxxdeceit/browsers
ENV NODE_PATH=/opt/kraxxdeceit/node_modules
WORKDIR /opt/kraxxdeceit
LABEL org.opencontainers.image.title="KraxxDeceit Sandbox browser runtime"
LABEL org.opencontainers.image.version="0.2.1"
LABEL io.kraxx.playwright.version="1.63.0"
LABEL io.kraxx.chromium.revision="1243"

# The existing procfs/socket collectors use Node built-ins. These utilities support their diagnostics.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates procps iproute2 util-linux coreutils && \
    rm -rf /var/lib/apt/lists/*
COPY runtime/package.json runtime/package-lock.json ./
# Network provisioning is confined to IMAGE BUILD; never copy application code or credentials.
RUN npm ci --ignore-scripts --omit=optional --no-audit --no-fund && \
    node ./node_modules/playwright/cli.js install --with-deps chromium --only-shell && \
    npm cache clean --force && rm -rf /var/lib/apt/lists/* /root/.npm && \
    chmod -R a+rX /opt/kraxxdeceit
COPY image-metadata.json verify-browser.cjs ./
ENV HOME=/vercel
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
USER ubuntu
# BuildKit blocks all network during the launch/about:blank/close check.
RUN --network=none node --version && \
    npx --offline --no playwright --version && \
    node /opt/kraxxdeceit/verify-browser.cjs
# Vercel Sandbox ignores CMD; the isolated test invokes the verification command explicitly.
CMD ["node", "/opt/kraxxdeceit/verify-browser.cjs"]
