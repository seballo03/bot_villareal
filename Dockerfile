FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN git clone https://github.com/wppconnect-team/wppconnect-server.git . && \
    npm install

EXPOSE 21465

CMD ["npm", "start"]
