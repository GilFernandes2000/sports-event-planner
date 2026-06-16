import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdmin } from "../AdminContext";
import { api, setToken } from "../api";
import { useI18n } from "../i18n";

export default function AuthCallback() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setSession } = useAdmin();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (token) {
      setToken(token);
      api
        .verify()
        .then((res) => {
          setSession(token, res.admin);
          navigate("/tournaments", { replace: true });
        })
        .catch(() => navigate("/?auth_error=1", { replace: true }));
      return;
    }

    if (error) {
      navigate(`/?auth_error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    navigate("/", { replace: true });
  }, [params, navigate, setSession]);

  return (
    <div className="app home-page">
      <p className="muted">{t("admin.oauthFinishing")}</p>
    </div>
  );
}
