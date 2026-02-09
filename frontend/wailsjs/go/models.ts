export namespace main {
	
	export class Response {
	    status: number;
	    headers: Record<string, string>;
	    body: string;
	    duration: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Response(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.duration = source["duration"];
	        this.error = source["error"];
	    }
	}

}

