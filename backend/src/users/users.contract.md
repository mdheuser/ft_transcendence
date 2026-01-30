

TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 
TEST ALL OF THESE 



USER MANAGEMENT API CONTRACT (as of now)

BASE URL
All endpoints below are under /api.

AUTH
Authorization uses Authorization: Bearer <token>.

Data shapes
PublicUser

id: number

username: string

avatar: string | null

online_status: "online" | "offline"

last_seen: number | null

PublicUserWithEmail

all fields from PublicUser

email: string | null

(Important invariant)

Public endpoints must never leak email, password_hash, password, two_fa_secret, two_fa_code (or any password-like field).

VALIDATED (covered by current backend/scripts/test-users.sh)

POST /register
Request JSON:

{ "username": string, "email": string, "password": string }

Response 200 JSON:

{ "token": string, "user": PublicUserWithEmail }
Validated checks:

token exists

user.id exists

Response 400 JSON:

{ "error": "Missing fields" }
Validated checks:

correct status code and exact error string

POST /login (normal login)
Request JSON:

{ "email": string, "password": string }

Response 200 JSON:

{ "token": string, "user": PublicUserWithEmail }
Validated checks:

token exists

Response 401 JSON:

{ "error": "Invalid credentials" }
Validated checks:

correct status code and exact error string (wrong password case)

GET /me (auth)
Headers:

Authorization: Bearer <token>

Response 200 JSON:

PublicUserWithEmail
Validated checks:

returned id matches the logged-in user

Response 401 JSON:

{ "error": "Unauthorized" } (or equivalent)
Validated checks:

correct status code when no token

GET /users/:id (public profile)
Response 200 JSON:

PublicUser
Validated checks:

returned id matches requested user id

response must not contain "email" key

response must not contain any "password" substring

PATCH /users/me (auth)
Request JSON:

{ "username": string, "email": string }

Response 200 JSON:

{ "ok": true }
Validated checks:

"ok": true present

Response 400:

when trying to set email to an email already used by another user
Validated checks:

status code 400 (script does not assert exact error string)

POST /friends/:id/add (auth)
Response 200 JSON:

{ "ok": true }
Validated checks:

"ok": true present

Response 400 JSON:

{ "error": "Cannot friend yourself" }
Validated checks:

status code + exact error string

Response 400 JSON:

{ "error": "Friend request already exists" }
Validated checks:

status code + exact error string (duplicate add)

POST /friends/:id/accept (auth)
Response 200 JSON:

{ "ok": true }
Validated checks:

"ok": true present

GET /friends (auth)
Response 200 JSON:

PublicUser[]
Validated checks:

after accept, list contains the other user id

after delete, list no longer contains that id

DELETE /friends/:id (auth)
Response 200 JSON:

{ "ok": true }
Validated checks:

status code 200 and "ok": true

UNTETSTED / PENDING (do not claim as validated yet)

A) POST /logout (auth)
Expected:

Response 200 { "ok": true }
Not tested.

B) POST /register duplicate email
Expected:

400 { "error": "Email already in use" }
Not tested (you never re-register same email).

C) POST /login 2FA required branch
Expected 401:

{ "error": "Two-Factor Authentication required", "two_fa_required": true, "temp_token": string }
Not tested.

D) POST /login 2FA finalize
Request JSON:

{ "two_fa_token": "123456" } with Authorization Bearer <temp_token>
Expected 200:

{ "token": string, "user": PublicUserWithEmail }
Not tested.

E) 2FA endpoints (auth)

GET /2fa/generate -> { "secret": "base32", "otpauthUrl": string }

POST /2fa/enable body { "token": "123456" } -> { "ok": true, "message": string } (and 401 on wrong token)

POST /2fa/disable -> { "ok": true, "message": string }
Not tested.

F) Friends edge cases

/friends/:id/add 404 { "error": "User not found" }

/friends/:id/accept 404 { "error": "Friend request not found" }

/friends/:id/accept 400 { "error": "Friend request not pending" }
Not tested.

G) GET /users/:id/stats response shape
Expected:

{ "wins": number, "losses": number, "total_games": number, "win_rate": number }
Currently only “responds” is observed; shape isn’t asserted.

H) GET /users/:id/history response shape
Expected:

array (possibly empty)
Currently only “responds” is observed; shape isn’t asserted.