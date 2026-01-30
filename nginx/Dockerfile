FROM nginx:1.28.0-alpine-slim

RUN apk add --no-cache openssl


RUN mkdir -p /etc/nginx/ssl && openssl req -x509 -nodes  \
-newkey rsa:2048 -keyout /etc/nginx/ssl/cert.key \
-out /etc/nginx/ssl/cert.crt -subj "/CN=localhost"


COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8443

CMD ["nginx", "-g", "daemon off;"]


#https://docs.docker.com/reference/dockerfile/
#https://wiki.alpinelinux.org/wiki/Alpine_Package_Keeper
#https://docs.openssl.org/master/man1/
