FROM node:18-alpine
WORKDIR /app
RUN npm install -g @wppconnect-team/wppconnect-server
EXPOSE 21465
CMD ["wppconnect-server"]
