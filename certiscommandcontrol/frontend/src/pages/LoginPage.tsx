import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";
import logo from "../assets/logo.png";


export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.length > 3 && password.length >= 6, [email, password]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error("No session returned.");

      nav("/dashboard");
    } catch (ex: any) {
      setErr(ex?.message ?? String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authShell">
      <div className="authCard">

        <img src={logo} className="authLogoImg" />

        <div className="authSub">Security Command & Control</div>
        <div className="authWelcome">WELCOME BACK</div>

        <form onSubmit={onLogin} className="authForm">

          <label className="authLabel">Email Address:</label>
          <input
            className="authInput"
            placeholder="Enter your email address ..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="authLabel">Password:</label>
          <input
            className="authInput"
            type="password"
            placeholder="Enter your password ..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="authRow">
            <label className="authRemember">
              <input type="checkbox" /> Remember me
            </label>

            <div className="authForgot">Forgot your password?</div>
          </div>

          {err && <div className="authError">{err}</div>}

          <button className="authBtn" disabled={!canSubmit || busy}>
            SIGN IN
          </button>
        </form>
      </div>
    </div>
  );
}