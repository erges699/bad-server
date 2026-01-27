# Users

#### Default admin
- login: `admin@mail.ru`
- password: `password`

#### Customer 1
- login: `user1@mail.ru`
- password: `password1`

# How to restore database
1. Через MongoDB Compass подключаемся к базе по адресу:
```
mongodb://root:example@localhost:27018/weblarek?authSource=admin
```
2. Выбираем коллекцию `users`, в ней `ADD DATA` и `Import JSON or CSV file`. Выбираем файл `.dump/weblarek.users.json`
3. Выбираем коллекцию `products`, в ней `ADD DATA` и `Import JSON or CSV file`. Выбираем файл `.dump/weblarek.products.json`
Файлы изображений для продуктов уже находятся в директории backend/src/public/images/


docker cp .dump/weblarek.users.json bad-server-mongo-1:/data/weblarek.users.json
docker cp .dump/weblarek.products.json bad-server-mongo-1:/data/weblarek.products.json

docker exec -it bad-server-mongo-1 /bin/bash

#mongoimport --db weblarek --collection users --file weblarek.users.json --jsonArray --username "root" --password "example"
#docker run -d -v db:/data/db mongo:latest --authDisabled
docker exec -it bad-server-mongo-1 mongoimport \
  --host "localhost:27017" \
  --db weblarek \
  --collection users \
  --file /data/weblarek.users.json \
  --jsonArray \
  --username "root" \
  --password "example" \
  --authenticationDatabase "admin"

docker exec -it bad-server-mongo-1 mongoimport \
  --host "localhost:27017" \
  --db weblarek \
  --collection products \
  --file /data/weblarek.products.json \
  --jsonArray \
  --username "root" \
  --password "example" \
  --authenticationDatabase "admin"

  docker exec -it bad-server-mongo-1 mongosh --host localhost --port 27017 -u root -p example --authenticationDatabase admin

test> use weblarek
weblarek> show collections
weblarek> db.products.countDocuments()
weblarek> db.users.countDocuments()
weblarek> db.users.find().limit(5)
weblarek> db.products.find().limit(5)


