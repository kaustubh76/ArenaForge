import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  crumbs: Crumb[];
}

export function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-4" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-white transition-colors flex items-center gap-1">
        <Home size={12} />
        <span>Arena</span>
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={10} className="text-gray-700" />
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-white transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-400">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
