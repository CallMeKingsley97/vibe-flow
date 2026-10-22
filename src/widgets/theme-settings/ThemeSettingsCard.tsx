import type { ThemePreference } from "../../features/theme/model/theme";
import { useTheme } from "../../features/theme/model/useTheme";
import { Icon, type IconName } from "../../shared/ui/icons";

const options: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: IconName;
}> = [
  { value: "system", label: "跟随系统", description: "自动同步系统外观", icon: "monitor" },
  { value: "dark", label: "深色", description: "适合暗光环境", icon: "moon" },
  { value: "light", label: "浅色", description: "适合明亮环境", icon: "sun" },
];

export function ThemeSettingsCard() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <section className="panel settings-card theme-settings-card">
      <div className="settings-card-header">
        <div className="card-heading">
          <span className="section-icon">
            <Icon name="sun" size={15} />
          </span>
          <div>
            <h3>外观</h3>
            <p>选择界面主题；跟随系统时会自动响应系统外观变化。</p>
          </div>
        </div>
        <span className="theme-current">当前为{resolvedTheme === "dark" ? "深色" : "浅色"}</span>
      </div>
      <div className="theme-options" role="radiogroup" aria-label="界面主题">
        {options.map((option) => (
          <button
            aria-checked={preference === option.value}
            className={preference === option.value ? "active" : ""}
            key={option.value}
            onClick={() => setPreference(option.value)}
            role="radio"
            type="button"
          >
            <span aria-hidden="true" className={`theme-preview theme-preview-${option.value}`}>
              <Icon name={option.icon} size={16} />
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
