import { Composition } from "remotion";
import { LastLineIntro } from "./LastLineIntro";

export const MyComposition = () => {
  return (
    <Composition
      id="LastLineIntro"
      component={LastLineIntro}
      durationInFrames={1080}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
