FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g @wppconnect-team/wppconnect-server@latest

EXPOSE 21465

CMD ["wppconnect-server"]
