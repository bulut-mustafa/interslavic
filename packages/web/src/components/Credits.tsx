/** The attribution every page carries: what the tools use, on what terms, and who made them. */
export function Credits() {
  return (
    <>
      An experimental, rule-based translator - it can be wrong, and says where it is guessing.
      Dictionary and grammar: the Interslavic dictionary (interslavic-dictionary.com) and Jan van
      Steenbergen&rsquo;s grammar pages (steen.free.fr/interslavic), used non-commercially with
      thanks.{' '}
      <a href="https://github.com/bulut-mustafa/interslavic" target="_blank" rel="noreferrer">
        Open source on GitHub
      </a>
      .
      <span className="made-by">
        Made with love by{' '}
        <a href="https://mustafabulut.dev" target="_blank" rel="noreferrer">
          Mustafa
        </a>
        .
      </span>
    </>
  );
}
