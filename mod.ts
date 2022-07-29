import { decode as base64Decode } from 'https://deno.land/std@0.145.0/encoding/base64.ts';
import { serve } from "https://deno.land/std@0.145.0/http/server.ts";
import { generateRandomSlug } from "https://dash.deno.com/utils/random.ts";

// Deployed to publish.deno.dev, not dash.deno.com, so either cookie or token needs to be set
const TOKEN = Deno.env.get('DENO_TOKEN');
const DASH_URL = 'https://dash.deno.com/new';

const getExtension = (url: string) =>
    (url.match(/\.([^.]*?)(?=\?|#|$)/) || [])[1];

// TODO: Omitting `url` param works for single mod.ts in main branch.
const fetchSnippet = async (url?: string) => { 
    const [_, user, repo] = url?.match(/https:\/\/github.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+).*/) ?? [];
    const isFromGitHub = !!user && !!repo;
    const snippetUrl = isFromGitHub ? `https://api.github.com/repos/${user}/${repo}/contents/mod.ts` : url;
    const response = await fetch(snippetUrl);
    const snippet = isFromGitHub
        ? new TextDecoder().decode(base64Decode((await response.json()).content))
        : await response.text();
    return { snippetUrl, snippet };
}

const reqHandler = async (req: Request, ctx: Context) => {
    const token = TOKEN ?? req.headers.get('Cookie');
    if (!token) return Response.redirect(DASH_URL);

    const args = Object.fromEntries(new URL(req.url).searchParams.entries());
    const { snippetUrl, snippet } = await fetchSnippet(args.url ?? req.headers.get('referer'));
    if (!snippet) return Response.redirect(DASH_URL);

    const envVars = args.env?.split(',')?.reduce((a, v) => ({ ...a, [v]: v}), {}) ?? {};
    const name = generateRandomSlug();
    const mediaType = getExtension(snippetUrl);

    const body = {
        name,
        envVars,
        playground: {
            snippet,
            mediaType
        }
    };

    const project = await (await fetch('https://dash.deno.com/api/projects', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    })).json();

    if (!project.name) throw new Error(project.message);

    return Response.redirect(`https://dash.deno.com/projects/${name}/settings`);
};

const errorHandler = (err: unknown) => 
    new Response((err as Error).message, { status: 500 });

serve(reqHandler, { onError: errorHandler });
