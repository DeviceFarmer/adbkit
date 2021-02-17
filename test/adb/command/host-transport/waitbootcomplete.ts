import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import WaitBootCompleteCommand from '../../../../src/adb/command/host-transport/waitbootcomplete';

describe('WaitBootCompleteCommand', function () {
    it('should send a while loop with boot check', function () {
        const conn = new MockConnection();
        const cmd = new WaitBootCompleteCommand(conn);
        const want = 'shell:while getprop sys.boot_completed 2>/dev/null; do sleep 1; done';
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData(want).toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('1\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute();
    });
    it('should reject with Parser.PrematureEOFError if connection cuts prematurely', function (done) {
        const conn = new MockConnection();
        const cmd = new WaitBootCompleteCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        cmd
            .execute()
            .then(function () {
                return done(new Error('Succeeded even though it should not'));
            })
            .catch(Parser.PrematureEOFError, function (err) {
                done();
            });
    });
    it('should not return until boot is complete', function () {
        const conn = new MockConnection();
        const cmd = new WaitBootCompleteCommand(conn);
        let sent = false;
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            conn.getSocket().causeRead('\r\n');
            return setTimeout(function () {
                sent = true;
                return conn.getSocket().causeRead('1\r\n');
            }, 50);
        });
        return cmd.execute().then(function () {
            expect(sent).to.be.true;
        });
    });
    return it('should close connection when done', function (done) {
        const conn = new MockConnection();
        const cmd = new WaitBootCompleteCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeRead('1\r\n');
        });
        conn.getSocket().on('end', function () {
            done();
        });
        cmd.execute();
    });
});
