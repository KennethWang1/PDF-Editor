FROM node:23-alpine
WORKDIR /ResuMade

ARG gid=2000
ARG group=appgroup
ARG uid=4200
ARG user=appuser

RUN apk add --no-cache shadow

COPY ./package.json ./
RUN npm install

COPY ResuMade/public/ /frontend/public
COPY ResuMade/src/ /frontend/src
COPY ResuMade/package.json /frontend/

WORKDIR /frontend
RUN npm install

EXPOSE 3000

#RUN getent group ${group} || groupadd -f -g ${gid} ${group}
#RUN getent passwd ${user} || useradd -u ${uid} -g ${group} -s /bin/sh ${user}
#USER ${user}

CMD ["npm","start"]