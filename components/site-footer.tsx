import { ExternalLink, MapPin } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-border/50 bg-secondary/40">
      <div className="container flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">Questions about the pool?</p>
        <div className="flex items-center gap-5">
          <a
            href="https://www.google.com/maps/dir/?api=1&destination=100+Julia+Drive+Wharton+NJ"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <MapPin className="h-3.5 w-3.5" />
            Get Directions
          </a>
          <span className="text-border">·</span>
          <a
            href="https://pondviewestatesnj.com/contact/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Leasing Office
          </a>
        </div>
      </div>
    </footer>
  );
}
