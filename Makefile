# ft_transcendence Makefile
# Simple commands to manage the Docker containers

.PHONY: all help up start down stop restart build rebuild logs logs-f logs-frontend logs-backend logs-nginx \
        status frontend backend nginx db test clean fclean re

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
BLUE = \033[0;34m
NC = \033[0m

# Docker compose command
COMPOSE := docker compose

# Default target
all: up

# Show help
help:
	@echo "$(GREEN)ft_transcendence - Available commands:$(NC)"
	@echo ""
	@echo "$(BLUE)Main commands:$(NC)"
	@echo "  $(YELLOW)make up$(NC)            - Build and start all containers"
	@echo "  $(YELLOW)make start$(NC)         - Start all containers (without building)"
	@echo "  $(YELLOW)make down$(NC)          - Stop all containers"
	@echo "  $(YELLOW)make stop$(NC)          - Stop all containers (alias for down)"
	@echo "  $(YELLOW)make restart$(NC)       - Restart all containers"
	@echo "  $(YELLOW)make build$(NC)         - Build all containers"
	@echo "  $(YELLOW)make rebuild$(NC)       - Rebuild and restart all containers"
	@echo "  $(YELLOW)make status$(NC)        - Show container status"
	@echo ""
	@echo "$(BLUE)Logs commands:$(NC)"
	@echo "  $(YELLOW)make logs$(NC)          - Show logs from all containers (last 50 lines)"
	@echo "  $(YELLOW)make logs-f$(NC)        - Follow logs from all containers"
	@echo "  $(YELLOW)make logs-frontend$(NC) - Show frontend logs"
	@echo "  $(YELLOW)make logs-backend$(NC)  - Show backend logs"
	@echo "  $(YELLOW)make logs-nginx$(NC)    - Show nginx logs"
	@echo ""
	@echo "$(BLUE)Individual services:$(NC)"
	@echo "  $(YELLOW)make frontend$(NC)      - Restart frontend container only"
	@echo "  $(YELLOW)make backend$(NC)       - Restart backend container only"
	@echo "  $(YELLOW)make nginx$(NC)         - Restart nginx container only"
	@echo ""
	@echo "$(BLUE)Database & Testing:$(NC)"
	@echo "  $(YELLOW)make db$(NC)            - Access SQLite database shell"
	@echo "  $(YELLOW)make test$(NC)          - Run backend tests"
	@echo ""
	@echo "$(BLUE)Cleanup commands:$(NC)"
	@echo "  $(YELLOW)make clean$(NC)         - Stop and remove containers + volumes"
	@echo "  $(YELLOW)make fclean$(NC)        - Full cleanup (containers, volumes, images)"
	@echo "  $(YELLOW)make re$(NC)            - Full rebuild (fclean + build + up)"
	@echo ""

# Build and start containers
up: build start

# Build containers
build:
	@echo "$(GREEN)Building containers...$(NC)"
	$(COMPOSE) build
	@echo "$(GREEN)Build complete!$(NC)"

# Start containers (without building)
start:
	@echo "$(GREEN)Starting containers...$(NC)"
	$(COMPOSE) up -d
	@echo "$(GREEN)Containers started! Access at https://localhost:8443$(NC)"

# Stop containers
down:
	@echo "$(YELLOW)Stopping containers...$(NC)"
	$(COMPOSE) down
	@echo "$(YELLOW)Containers stopped.$(NC)"

# Alias for down
stop: down

# Restart all containers
restart:
	@echo "$(YELLOW)Restarting containers...$(NC)"
	$(COMPOSE) restart
	@echo "$(GREEN)Containers restarted!$(NC)"

# Rebuild and restart
rebuild:
	@echo "$(GREEN)Rebuilding containers...$(NC)"
	$(COMPOSE) up -d --build
	@echo "$(GREEN)Rebuild complete!$(NC)"

# Show logs (last 50 lines)
logs:
	@echo "$(BLUE)Showing logs (last 50 lines)...$(NC)"
	$(COMPOSE) logs --tail=50

# Follow logs
logs-f:
	@echo "$(BLUE)Following logs (Ctrl+C to exit)...$(NC)"
	$(COMPOSE) logs -f

# Frontend logs
logs-frontend:
	@echo "$(BLUE)Frontend logs:$(NC)"
	$(COMPOSE) logs frontend --tail=30

# Backend logs
logs-backend:
	@echo "$(BLUE)Backend logs:$(NC)"
	$(COMPOSE) logs backend --tail=30

# Nginx logs
logs-nginx:
	@echo "$(BLUE)Nginx logs:$(NC)"
	$(COMPOSE) logs nginx --tail=30

# Show container status
status:
	@echo "$(GREEN)Container status:$(NC)"
	@$(COMPOSE) ps

# Restart individual services
frontend:
	@echo "$(YELLOW)Restarting frontend...$(NC)"
	$(COMPOSE) restart frontend
	@sleep 2
	@$(COMPOSE) logs frontend --tail=15
	@echo "$(GREEN)Frontend restarted! Hard refresh browser (Ctrl+Shift+R)$(NC)"

backend:
	@echo "$(YELLOW)Restarting backend...$(NC)"
	$(COMPOSE) restart backend
	@$(COMPOSE) logs backend --tail=10
	@echo "$(GREEN)Backend restarted!$(NC)"

nginx:
	@echo "$(YELLOW)Restarting nginx...$(NC)"
	$(COMPOSE) restart nginx
	@$(COMPOSE) logs nginx --tail=10
	@echo "$(GREEN)Nginx restarted!$(NC)"

# Access database shell
db:
	@echo "$(BLUE)Opening SQLite database shell...$(NC)"
	@docker exec -it sqlite sqlite3 /data/database.sqlite

# Run tests
test:
	@echo "$(BLUE)Running backend tests...$(NC)"
	$(COMPOSE) run --rm backend npm test -- --allow-incomplete-coverage

# Clean - stop and remove containers + volumes
clean:
	@echo "$(RED)Stopping and removing containers + volumes...$(NC)"
	$(COMPOSE) down --volumes
	@echo "$(RED)Cleanup complete.$(NC)"

# Full clean - remove everything including images
fclean:
	@echo "$(RED)Performing full cleanup...$(NC)"
	$(COMPOSE) down --volumes --rmi all
	@echo "$(RED)Removing local volumes...$(NC)"
	@docker volume prune -af
	@echo "$(RED)Removing unused data...$(NC)"
	@docker system prune -af
	@echo "$(RED)Full cleanup complete.$(NC)"

# Full rebuild from scratch
re: fclean
	@echo "$(GREEN)Starting full rebuild...$(NC)"
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d
	@echo "$(GREEN)Full rebuild complete! Access at https://localhost:8443$(NC)"