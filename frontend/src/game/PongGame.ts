export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

export interface Paddle {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
}

export class PongGame {

    // Game settings
    public static readonly WINNING_SCORE = 3;


    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private animationId: number | null = null;
    private paused: boolean = false;
    private gameEnded: boolean = false;

    // Game objects
    private ball: Ball;
    private paddle1: Paddle;
    private paddle2: Paddle;
    private score: number[] = [0, 0];

    private mode: 'pvp' | 'single';

    // Collision tracking to prevent ball getting stuck
    private lastPaddleHit: number = 0;
    private paddleHitCooldown: number = 100; // milliseconds

    // Player names
    private player1Name: string = 'Player 1';
    private player2Name: string = 'Player 2';

    // Callback for game end
    private onGameEndCallback?: (winner: string, score: number[]) => void;

    // Controls
    private keys: { [key: string]: boolean } = {};

    // Game settings (mutable for settings adjustment)
    private PADDLE_SPEED = 6;
    private BALL_SPEED = 5;
    private PADDLE_HEIGHT = 90;

    constructor(
        canvas: HTMLCanvasElement,
        player1Name?: string,
        player2Name?: string,
        onGameEnd?: (winner: string, score: number[]) => void,
        options?: { mode?: 'pvp' | 'single' }
    ) {
        this.canvas = canvas;

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = context;

        this.mode = options?.mode ?? 'pvp';

        // Names
        if (player1Name) this.player1Name = player1Name;
        if (player2Name) this.player2Name = player2Name;

        if (onGameEnd) this.onGameEndCallback = onGameEnd;

        // Game objects
        this.ball = this.createBall();
        this.paddle1 = this.createPaddle(20);
        this.paddle2 = this.createPaddle(this.canvas.width - 30);

        // Controls only for humans
        this.setupControls();
    }


    private createBall(): Ball {
        return {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            vx: this.BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
            vy: this.BALL_SPEED * (Math.random() * 0.5 + 0.5) * (Math.random() > 0.5 ? 1 : -1),
            radius: 5
        };
    }

    private createPaddle(x: number): Paddle {
        return {
            x: x,
            y: this.canvas.height / 2 - this.PADDLE_HEIGHT / 2,
            width: 8,
            height: this.PADDLE_HEIGHT,
            speed: this.PADDLE_SPEED
        };
    }

    private setupControls(): void {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    public start(): void {
        if (!this.animationId && !this.gameEnded) {
            this.paused = false;
            this.gameLoop();
        }
    }

    public togglePause(): void {
        this.paused = !this.paused;
    }

    public isPaused(): boolean {
        return this.paused;
    }

    public isRunning(): boolean {
        return this.animationId !== null && !this.gameEnded;
    }

    public reset(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.gameEnded = false;
        this.score = [0, 0];
        this.ball = this.createBall();
        this.paddle1 = this.createPaddle(20);
        this.paddle2 = this.createPaddle(this.canvas.width - 30);
        this.updateScore();
        this.draw();
    }

    private gameLoop = (): void => {
        if (!this.paused && !this.gameEnded) {
            this.update();
            this.draw();
        }

        if (!this.gameEnded) {
            this.animationId = requestAnimationFrame(this.gameLoop);
        }
    }
    private updateAI(): void {
        const paddle = this.paddle2;

        const paddleCenter = paddle.y + paddle.height / 2;

        if (this.ball.x < this.canvas.width / 2) return;

        if (this.ball.y > paddleCenter + 10) 
            paddle.y += this.PADDLE_SPEED * 0.8;
        else if (this.ball.y < paddleCenter - 10) 
            paddle.y -= this.PADDLE_SPEED * 0.8;

        paddle.y = Math.max(0, Math.min(
            this.canvas.height - paddle.height,
            paddle.y
        ));
    }

    private update(): void {
        // Move paddles based on input
        // Player 1: W/S
        if (this.keys['w'] || this.keys['W']) {
            this.paddle1.y = Math.max(0, this.paddle1.y - this.paddle1.speed);
        }
        if (this.keys['s'] || this.keys['S']) {
            this.paddle1.y = Math.min(
                this.canvas.height - this.paddle1.height,
                this.paddle1.y + this.paddle1.speed
            );
        }

        // Player 2
        if (this.mode === 'pvp') {
            // if (this.keys['ArrowUp']) {
            if (this.keys['o'] || this.keys['O']) {
                this.paddle2.y = Math.max(0, this.paddle2.y - this.paddle2.speed);
            }
            // if (this.keys['ArrowDown']) {
            if (this.keys['l'] || this.keys['L']) {
                this.paddle2.y = Math.min(
                    this.canvas.height - this.paddle2.height,
                    this.paddle2.y + this.paddle2.speed
                );
            }
        } else {
            this.updateAI();
        }


        // Move ball
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;

        // Ball collision with top and bottom
        if (this.ball.y - this.ball.radius <= 0 ||
            this.ball.y + this.ball.radius >= this.canvas.height) {
            this.ball.vy = -this.ball.vy;
            // Prevent ball from getting stuck in walls
            if (this.ball.y - this.ball.radius <= 0) {
                this.ball.y = this.ball.radius;
            } else {
                this.ball.y = this.canvas.height - this.ball.radius;
            }
        }

        // Ball collision with paddles (with cooldown to prevent getting stuck)
        const now = Date.now();
        if (now - this.lastPaddleHit > this.paddleHitCooldown) {
            const paddle1Hit = this.checkPaddleCollision(this.paddle1);
            const paddle2Hit = this.checkPaddleCollision(this.paddle2);
            
            if (paddle1Hit || paddle2Hit) {
                // Determine which paddle was hit
                const paddle = paddle1Hit ? this.paddle1 : this.paddle2;
                
                // Push ball out of paddle to prevent sticking
                if (paddle1Hit) {
                    this.ball.x = this.paddle1.x + this.paddle1.width + this.ball.radius;
                } else if (paddle2Hit) {
                    this.ball.x = this.paddle2.x - this.ball.radius;
                }
                
                // Original Pong (1972) physics: angle depends on hit position
                // Calculate where ball hit the paddle (0 = center, -1 = top edge, +1 = bottom edge)
                const paddleCenter = paddle.y + paddle.height / 2;
                const hitPosition = (this.ball.y - paddleCenter) / (paddle.height / 2);
                
                // Calculate new velocity based on hit position
                // Max angle: ~60 degrees (about 1.0 radians)
                const maxAngle = 1.0;
                const angle = hitPosition * maxAngle;
                
                // Set velocity components to maintain constant speed
                const direction = paddle1Hit ? 1 : -1; // 1 = right, -1 = left
                this.ball.vx = direction * this.BALL_SPEED * Math.cos(angle);
                this.ball.vy = this.BALL_SPEED * Math.sin(angle);
                
                this.lastPaddleHit = now;
            }
        }

        // Score points
        if (this.ball.x - this.ball.radius <= 0) {
            // Player 2 scores
            this.score[1]++;
            this.updateScore();
            // Check for winner immediately after scoring
            if (this.score[1] >= PongGame.WINNING_SCORE) {
                this.gameEnded = true;
                this.endGame();
                return;
            }
            this.resetBall();
        } else if (this.ball.x + this.ball.radius >= this.canvas.width) {
            // Player 1 scores
            this.score[0]++;
            this.updateScore();
            // Check for winner immediately after scoring
            if (this.score[0] >= PongGame.WINNING_SCORE) {
                this.gameEnded = true;
                this.endGame();
                return;
            }
            this.resetBall();
        }
    }

    private checkPaddleCollision(paddle: Paddle): boolean {
        // Check if ball overlaps with paddle
        const ballLeft = this.ball.x - this.ball.radius;
        const ballRight = this.ball.x + this.ball.radius;
        const ballTop = this.ball.y - this.ball.radius;
        const ballBottom = this.ball.y + this.ball.radius;
        
        const paddleLeft = paddle.x;
        const paddleRight = paddle.x + paddle.width;
        const paddleTop = paddle.y;
        const paddleBottom = paddle.y + paddle.height;
        
        // Check for collision
        const isColliding = (
            ballRight >= paddleLeft &&
            ballLeft <= paddleRight &&
            ballBottom >= paddleTop &&
            ballTop <= paddleBottom
        );
        
        // Only register collision if ball is moving toward the paddle
        // This prevents detection when ball is moving away (already bounced)
        if (isColliding) {
            // Left paddle: ball should be moving left (negative vx)
            if (paddle.x < this.canvas.width / 2) {
                return this.ball.vx < 0;
            }
            // Right paddle: ball should be moving right (positive vx)
            else {
                return this.ball.vx > 0;
            }
        }
        
        return false;
    }

    private resetBall(): void {
        this.ball.x = this.canvas.width / 2;
        this.ball.y = this.canvas.height / 2;
        this.ball.vx = this.BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
        this.ball.vy = this.BALL_SPEED * (Math.random() * 0.5 + 0.5) * (Math.random() > 0.5 ? 1 : -1);
    }

    private updateScore(): void {
        const score1El = document.getElementById('score1');
        const score2El = document.getElementById('score2');
        if (score1El) score1El.textContent = this.score[0].toString();
        if (score2El) score2El.textContent = this.score[1].toString();
    }

    private endGame(): void {
        const winner = this.score[0] >= PongGame.WINNING_SCORE ? this.player1Name : this.player2Name;

        // Call the callback if provided
        if (this.onGameEndCallback) {
            this.onGameEndCallback(winner, [...this.score]);
        }

        // Draw final frame with winner message
        this.draw();
    }

    private drawWinnerNotification(): void {
        const winner = this.score[0] >= PongGame.WINNING_SCORE ? this.player1Name : this.player2Name;

        this.ctx.save();

        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Winner text
        this.ctx.fillStyle = '#00ff88';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${winner} Wins!`, centerX, centerY - 20);

        // Score display
        this.ctx.font = '32px Arial';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`${this.score[0]} - ${this.score[1]}`, centerX, centerY + 30);

        this.ctx.restore();
    }

    private draw(): void {
        // Clear canvas (dark background)
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw center line (neon green)
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw paddles (neon green with glow)
        this.ctx.fillStyle = '#00ff88';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00ff88';
        this.ctx.fillRect(this.paddle1.x, this.paddle1.y, this.paddle1.width, this.paddle1.height);
        this.ctx.fillRect(this.paddle2.x, this.paddle2.y, this.paddle2.width, this.paddle2.height);

        // Draw ball (neon green with glow)
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Draw winner notification if game has ended
        if (this.gameEnded) {
            this.drawWinnerNotification();
        }
    }

    public updateSettings(settings: { ballSpeed?: number; paddleSpeed?: number; paddleHeight?: number }): void {
        if (settings.ballSpeed !== undefined) {
            this.BALL_SPEED = settings.ballSpeed;
            // Update current ball velocity magnitude
            const currentSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
            const ratio = this.BALL_SPEED / currentSpeed;
            this.ball.vx *= ratio;
            this.ball.vy *= ratio;
        }
        
        if (settings.paddleSpeed !== undefined) {
            this.PADDLE_SPEED = settings.paddleSpeed;
            // Update existing paddles' speed
            this.paddle1.speed = settings.paddleSpeed;
            this.paddle2.speed = settings.paddleSpeed;
        }
        
        if (settings.paddleHeight !== undefined) {
            this.PADDLE_HEIGHT = settings.paddleHeight;
            // Update existing paddles
            const oldHeight1 = this.paddle1.height;
            const oldHeight2 = this.paddle2.height;
            this.paddle1.height = settings.paddleHeight;
            this.paddle2.height = settings.paddleHeight;
            // Adjust Y position to keep paddles centered on their previous position
            this.paddle1.y += (oldHeight1 - settings.paddleHeight) / 2;
            this.paddle2.y += (oldHeight2 - settings.paddleHeight) / 2;
            // Keep paddles within bounds
            this.paddle1.y = Math.max(0, Math.min(this.canvas.height - this.paddle1.height, this.paddle1.y));
            this.paddle2.y = Math.max(0, Math.min(this.canvas.height - this.paddle2.height, this.paddle2.y));
        }
    }

    public destroy(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        // Remove event listeners
        window.removeEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });
        window.removeEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }
}
