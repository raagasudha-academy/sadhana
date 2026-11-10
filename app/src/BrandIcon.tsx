import { useState } from 'react';
import { Flower2 } from 'lucide-react';

/**
 * Displays the supplied Sadhana artwork once public/sadhana-icon.png is installed.
 * A graceful fallback keeps the development portal usable before that asset exists.
 */
export default function BrandIcon() {
  const [missing, setMissing] = useState(false);
  return missing
    ? <Flower2 size={25} strokeWidth={1.9} aria-hidden="true" />
    : <img className="sadhana-brand-image" src="/sadhana-icon.png" alt="" width={30} height={30} onError={() => setMissing(true)} />;
}
