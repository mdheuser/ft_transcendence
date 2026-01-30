FROM node:22-alpine

RUN apk add --no-cache \
    python3 \
    py3-setuptools \
    make \
    g++ \
    libc6-compat \
    sqlite \
    sqlite-dev \
    pkgconf

RUN npm install -g nodemon

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

# Rebuild native deps for Alpine/musl inside the image
RUN npm rebuild better-sqlite3 --build-from-source

COPY . .

RUN mkdir -p /app/data

EXPOSE 8888

CMD ["npm", "run", "ts-dev"]
