import CurvedTextEditor from "./components/curved-text/CurvedTextEditor";
import DesktopOnlyNotice from "./components/curved-text/DesktopOnlyNotice";
import HomeLoader from "./components/curved-text/HomeLoader";

export default function Home() {
  return (
    <>
      {/* En dessous de `lg` (tablette / mobile) : écran « desktop uniquement ». */}
      <DesktopOnlyNotice />
      {/* L'éditeur (et son loader) n'apparaît qu'à partir de `lg`. */}
      <div className="hidden lg:contents">
        <HomeLoader />
        <CurvedTextEditor />
      </div>
    </>
  );
}
