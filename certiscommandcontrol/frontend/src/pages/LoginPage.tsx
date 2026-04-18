import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";
import logo from "../assets/logo.png";

const REQUIRED_ROLE = "Security Supervisor";

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("No session returned.");

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (employeeError) {
        await supabase.auth.signOut();
        throw new Error(employeeError.message || "Unable to verify employee role.");
      }

      if (!employee || employee.role !== REQUIRED_ROLE) {
        await supabase.auth.signOut();
        throw new Error("Access denied. Only Security Supervisors can sign in.");
      }

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
