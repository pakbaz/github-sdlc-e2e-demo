import { AREA_POLICIES, SCENARIOS } from './policy';
import { repoUrl } from '../../config';

export function PolicyPage() {
  return (
    <div className="policy">
      <section className="policy__intro">
        <p className="pipeline__eyebrow">The rule everything turns on</p>
        <h1 className="pipeline__title">
          Priority decides how fast we care.
          <br />
          <em>Risk decides who has to say yes.</em>
        </h1>
        <p className="pipeline__lede">
          Most automation debates stall on “should the agent be allowed to merge?” — which is the
          wrong question. The right question is <strong>where</strong> the change lands. A cosmetic
          fix and a session-expiry fix can both be P0; only one of them deserves a human in the
          loop.
        </p>
      </section>

      <section className="policy__block">
        <h2 className="policy__h2">Risk is a property of the path</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Paths</th>
                <th scope="col">Risk</th>
                <th scope="col">Code owner</th>
                <th scope="col">Lane</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {AREA_POLICIES.map((policy) => (
                <tr key={policy.area}>
                  <th scope="row">
                    <span className="tag tag--area">{policy.label}</span>
                  </th>
                  <td>
                    {policy.paths.map((path) => (
                      <code className="path" key={path}>
                        {path}
                      </code>
                    ))}
                  </td>
                  <td>
                    <span className={`tag tag--risk-${policy.risk}`}>{policy.risk}</span>
                  </td>
                  <td>{policy.codeowner ? <><span className="emoji">✅</span>required</> : '— none'}</td>
                  <td>
                    {policy.risk === 'low' ? (
                      <span className="tag tag--auto">auto</span>
                    ) : (
                      <span className="tag tag--gate">human gate</span>
                    )}
                  </td>
                  <td className="policy__why">{policy.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="policy__block">
        <h2 className="policy__h2">How GitHub actually enforces it</h2>
        <ol className="policy__steps">
          <li>
            <strong>
              <code>.github/CODEOWNERS</code>
            </strong>{' '}
            assigns owners to <code>src/features/auth/</code>, <code>src/features/api/</code>,{' '}
            <code>infra/</code> and <code>.github/</code>. Presentation paths get no owner on
            purpose.
          </li>
          <li>
            The <strong>ruleset on <code>main</code></strong> sets{' '}
            <em>required approvals = 0</em> plus <em>require code-owner review</em>.
          </li>
          <li>
            A pull request touching only unowned paths therefore needs{' '}
            <strong>zero approvals</strong> — CI passes and auto-merge ships it.
          </li>
          <li>
            A pull request touching an owned path needs{' '}
            <strong>a code owner&apos;s approval</strong> — and no workflow, token or agent can
            bypass it.
          </li>
        </ol>
        <p className="policy__note">
          The gate is enforced by the platform, not by a script that an agent could edit. The
          agentic review workflow is deliberately restricted to <code>COMMENT</code> and{' '}
          <code>REQUEST_CHANGES</code> so it can never approve its own work.
        </p>
      </section>

      <section className="policy__block">
        <h2 className="policy__h2">The five demo scenarios</h2>
        <div className="scenarios">
          {SCENARIOS.map((scenario) => (
            <article className={`scenario scenario--${scenario.lane}`} key={scenario.id}>
              <header className="scenario__head">
                <span className={`tag tag--${scenario.priority}`}>{scenario.priority}</span>
                <span className={`tag tag--risk-${scenario.risk}`}>risk/{scenario.risk}</span>
                <span className="tag tag--area">area/{scenario.area}</span>
              </header>
              <h3 className="scenario__title">{scenario.title}</h3>
              <p className="scenario__summary">{scenario.summary}</p>
              <p className={`scenario__lane scenario__lane--${scenario.lane}`}>
                <span className="emoji">{scenario.lane === 'auto' ? '🟢' : '🛑'}</span>
                {scenario.lane === 'auto' ? 'automated lane' : 'human gate'}
              </p>
            </article>
          ))}
        </div>
        <p className="policy__note">
          Note the second one. <strong>P0 with low risk still ships itself</strong> — that is the
          whole point. Urgency is not a reason to add a human; blast radius is.
        </p>
        <p className="policy__note">
          Seed them from the Actions tab of{' '}
          <a href={`${repoUrl}/actions`} target="_blank" rel="noreferrer">
            the repository
          </a>{' '}
          with the <code>Demo · seed scenarios</code> workflow.
        </p>
      </section>
    </div>
  );
}
