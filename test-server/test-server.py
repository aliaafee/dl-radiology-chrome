from flask import Flask, render_template, request

app = Flask(__name__)

@app.route('/')
def home():
    return render_template("index.html")

@app.route('/about')
def about():
    return 'This is a simple Flask web application.'

@app.route('/greet/<name>')
def greet(name):
    return f'Hello, {name}!'

@app.route("/df/pcc/widgets/radiologyServices/<patientId>/100")
def studies(patientId):
    print(patientId)
    return render_template("studies.json")

@app.route("/zfpviewer/api/download")
def study():
    filename = request.args.get("filename")
    print(filename)
    return render_template("study.json")

@app.route("/download")
def download():
    return "This is a test file"

if __name__ == '__main__':
    app.run(debug=True)
