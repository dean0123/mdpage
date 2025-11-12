# Build stage
FROM node:20-alpine AS builder

# 代理設定（可選，依環境調整）
ENV HTTP_PROXY="http://10.1.229.229:15629/"
ENV HTTPS_PROXY="http://10.1.229.229:15629/"

RUN npm config set proxy http://10.1.229.229:15629/
RUN npm config set https-proxy http://10.1.229.229:15629/ 
#RUN echo 'Acquire::http::Proxy "http://10.1.229.229:15629/";' > /etc/apt/apt.conf

#RUN echo 'Acquire::http::Proxy "http://10.1.229.229:15629/";' > /etc/apt/apt.conf

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
