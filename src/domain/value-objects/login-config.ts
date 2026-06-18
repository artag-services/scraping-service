export class LoginConfig {
  constructor(
    public readonly usernameSelector: string,
    public readonly passwordSelector: string,
    public readonly submitSelector: string,
    public readonly username: string,
    public readonly password: string,
    public readonly sessionKey?: string,
    public readonly successSelector?: string,
  ) {}
}
