FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache curl ca-certificates python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=3002
ENV DATA_DIR=/app/data
ENV NODE_ENV=production

EXPOSE 3002

VOLUME ["/app/data"]

CMD ["npm", "start"]
