import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: "en", label: "English",   native: "English"   },
  { code: "hi", label: "Hindi",     native: "हिंदी"      },
  { code: "bn", label: "Bengali",   native: "বাংলা"      },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"      },
  { code: "te", label: "Telugu",    native: "తెలుగు"    },
  { code: "ta", label: "Tamil",     native: "தமிழ்"     },
  { code: "pa", label: "Punjabi",   native: "ਪੰਜਾਬੀ"    },
  { code: "gu", label: "Gujarati",  native: "ગુજરાતી"   },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2.5 hover:bg-foreground/5 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Change language"
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium hidden sm:inline">{current.native}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 glass-card-strong">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`cursor-pointer flex justify-between ${lang.code === i18n.language ? "text-primary font-semibold" : ""}`}
          >
            <span>{lang.native}</span>
            <span className="text-xs text-muted-foreground">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
