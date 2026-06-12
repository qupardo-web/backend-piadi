# Express + PostgreSQL Backend (Decoupled)

Este es el proyecto de Backend independiente desarrollado en Node.js + Express y conectado a una base de datos PostgreSQL.

## Instrucciones para levantar el Backend

1. Abre una terminal dentro de esta carpeta (`C:\Users\ezequ\Desktop\express-backend`).
2. Levanta el servidor y la base de datos con:
   ```bash
   docker compose up --build
   ```
3. El backend estará disponible en:
   - **API:** `http://localhost:5000`
   - **Documentación Swagger:** `http://localhost:5000/api-docs`
   - **Base de datos PostgreSQL:** Expuesta en el puerto `5432` con usuario `postgres` y contraseña `postgres`.
