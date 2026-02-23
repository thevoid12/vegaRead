- command to run in local
```sh
bun tauri dev
```
- create migration(both first time as well as consecutive times)
```sh
sqlx migrate add <migration_name>   
```
- run migration
```sh
sqlx migrate run   
```
- you can find the internal folder at:
```sh 
/home/void/.local/share/com.void.vagaread/
```