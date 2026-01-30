# frontend/Dockerfile

# --- Stage 1: Build Stage (Node for compilation) ---
FROM node:22-alpine AS build-stage

WORKDIR /app

# Install dependencies (only required devDependencies)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source files
COPY . .

# Create the output directory
RUN mkdir -p dist

# Run the build command: compiles TS to dist/*.js and Tailwind to dist/main.css
RUN npm run build

# Copy Nginx config for use in the final stage
COPY nginx.conf /etc/nginx/conf.d/default.conf


# --- Stage 2: Production Stage (Nginx for serving) ---
FROM nginx:alpine AS final

# Copy Nginx config
COPY --from=build-stage /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

# Copy the compiled assets and HTML into the Nginx content directory
# /app/dist contains index.js and main.css
COPY --from=build-stage /app/dist /usr/share/nginx/html/
# Copy the source HTML file
COPY --from=build-stage /app/index.html /usr/share/nginx/html/index.html

# Default Nginx command runs the server on port 80.
EXPOSE 80
